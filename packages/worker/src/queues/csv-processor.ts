import type { Env, CsvUploadRow, CampaignRow, ContactRow, KvLinkData } from '../types';
import { generateId } from '../lib/id';
import { generateUniqueSlug, normalizePhone, interpolateTemplate } from '../lib/helpers';
import { setLinkData } from '../lib/kv';

/**
 * Process a CSV upload: parse file, create contacts, generate slugs, write KV.
 */
export async function processCsvUpload(
  env: Env,
  uploadId: string,
  campaignId: string,
  workspaceId: string
): Promise<void> {
  // Mark as processing
  await env.DB.prepare(`
    UPDATE csv_uploads SET status = 'processing', updated_at = datetime('now') WHERE id = ?
  `).bind(uploadId).run();

  const upload = await env.DB.prepare(
    'SELECT * FROM csv_uploads WHERE id = ?'
  ).bind(uploadId).first<CsvUploadRow>();

  if (!upload) {
    throw new Error(`Upload ${uploadId} not found`);
  }

  const campaign = await env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspaceId).first<CampaignRow>();

  if (!campaign) {
    await markUploadFailed(env, uploadId, 'Campaign not found');
    return;
  }

  // Fetch CSV from R2
  const r2Object = await env.R2.get(upload.r2_key);
  if (!r2Object) {
    await markUploadFailed(env, uploadId, 'CSV file not found in storage');
    return;
  }

  const csvText = await r2Object.text();
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 2) {
    await markUploadFailed(env, uploadId, 'CSV has no data rows');
    return;
  }

  // Parse header
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Determine field mapping + upload metadata
  let mapping: Record<string, string> = {};
  let duplicateMode: 'keep' | 'replace' = 'keep';
  if (upload.field_mapping) {
    const parsed = JSON.parse(upload.field_mapping);
    if (parsed && typeof parsed === 'object' && ('mapping' in parsed || '__meta' in parsed)) {
      mapping = (parsed.mapping || {}) as Record<string, string>;
      const rawMode = parsed.__meta?.duplicate_mode;
      duplicateMode = rawMode === 'replace' ? 'replace' : 'keep';
    } else {
      mapping = parsed as Record<string, string>;
    }
  } else {
    // Auto-detect: find firstname and phone columns
    for (const col of header) {
      if (['firstname', 'first_name', 'first name', 'name'].includes(col)) {
        mapping['firstname'] = col;
      }
      if (['phone', 'phone_number', 'phonenumber', 'mobile', 'telephone'].includes(col)) {
        mapping['phone'] = col;
      }
    }
  }

  if (!mapping['firstname'] || !mapping['phone']) {
    await markUploadFailed(env, uploadId, 'Cannot detect firstname and phone columns. Please provide field mapping.');
    return;
  }

  let generateShortlinks = campaign.disable_shortlink_generation !== 1;

  // Get existing slugs for collision detection
  const existingSlugs = new Set<string>();
  if (generateShortlinks) {
    const existingSlugsResult = await env.DB.prepare(
      'SELECT slug FROM links WHERE campaign_id = ?'
    ).bind(campaignId).all<{ slug: string }>();

    for (const row of existingSlugsResult.results) {
      existingSlugs.add(row.slug);
    }
  }

  // Existing contacts + links by phone for dedup/replace behavior.
  const existingContactsResult = await env.DB.prepare(`
    SELECT c.id as contact_id, c.phone, l.id as link_id, l.slug
    FROM contacts c
    LEFT JOIN links l ON l.contact_id = c.id AND l.campaign_id = c.campaign_id
    WHERE c.campaign_id = ?
  `).bind(campaignId).all<{ contact_id: string; phone: string; link_id: string | null; slug: string | null }>();

  const existingByPhone = new Map<string, { contactId: string; linkId: string | null; slug: string | null }>();
  for (const row of existingContactsResult.results) {
    existingByPhone.set(row.phone, {
      contactId: row.contact_id,
      linkId: row.link_id,
      slug: row.slug,
    });
  }

  let processed = 0;
  let failed = 0;
  const BATCH_SIZE = 50;

  // Process in batches
  for (let i = 1; i < lines.length; i += BATCH_SIZE) {
    // Re-check campaign status during long-running uploads to avoid races with Kill.
    const latestCampaign = await env.DB.prepare(
      'SELECT status, disable_shortlink_generation FROM campaigns WHERE id = ? AND workspace_id = ?'
    ).bind(campaignId, workspaceId).first<{ status: string; disable_shortlink_generation: number }>();

    if (!latestCampaign || latestCampaign.status === 'expired') {
      await markUploadFailed(env, uploadId, 'Campaign was killed/expired while processing upload');
      return;
    }

    generateShortlinks = latestCampaign.disable_shortlink_generation !== 1;

    const batch = lines.slice(i, i + BATCH_SIZE);
    const dbStatements: D1PreparedStatement[] = [];
    const kvWrites: Array<{ key: string; slug: string; contactId: string; linkId: string }> = [];

    for (const line of batch) {
      try {
        const values = parseCSVLine(line);
        if (values.length < header.length) {
          failed++;
          continue;
        }

        const rowMap: Record<string, string> = {};
        header.forEach((h, idx) => { rowMap[h] = values[idx]?.trim() || ''; });

        const firstname = rowMap[mapping['firstname']] || '';
        const rawPhone = rowMap[mapping['phone']] || '';

        if (!firstname || !rawPhone) {
          failed++;
          continue;
        }

        const phone = normalizePhone(rawPhone);
        if (!phone) {
          failed++;
          continue;
        }

        const existing = existingByPhone.get(phone);
        if (existing && duplicateMode === 'keep') {
          failed++; // skipped duplicate
          continue;
        }

        // Build extra data from remaining columns
        const extraData: Record<string, string> = {};
        for (const [key, col] of Object.entries(mapping)) {
          if (key !== 'firstname' && key !== 'phone' && rowMap[col]) {
            extraData[key] = rowMap[col];
          }
        }
        // Include any unmapped columns
        for (const h of header) {
          if (!Object.values(mapping).includes(h) && rowMap[h]) {
            extraData[h] = rowMap[h];
          }
        }

        let contactId = generateId();
        let linkId: string | null = generateShortlinks ? generateId() : null;
        let slug: string | null = generateShortlinks ? await generateUniqueSlug(firstname, existingSlugs) : null;

        if (existing) {
          contactId = existing.contactId;
          if (generateShortlinks && existing.linkId && existing.slug) {
            linkId = existing.linkId;
            slug = existing.slug;
          }
        } else if (generateShortlinks && slug) {
          existingSlugs.add(slug);
        }

        // Interpolate URL parameters: {column_name} → contact's CSV value
        // URI-encode all values to prevent parameter injection in URLs
        const urlVariables: Record<string, string> = {};
        for (const [k, v] of Object.entries({ firstname, phone, ...rowMap, ...extraData })) {
          urlVariables[k] = encodeURIComponent(v);
        }
        const destinationUrl = interpolateTemplate(campaign.base_url, urlVariables);

        if (existing) {
          // Replace mode: update existing contact and optionally existing link destination.
          dbStatements.push(
            env.DB.prepare(`
              UPDATE contacts
              SET firstname = ?, extra_data = ?
              WHERE id = ? AND campaign_id = ?
            `).bind(
              firstname,
              Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
              contactId,
              campaignId
            )
          );

          if (generateShortlinks && existing.linkId) {
            dbStatements.push(
              env.DB.prepare(`
                UPDATE links
                SET destination_url = ?
                WHERE id = ? AND campaign_id = ?
              `).bind(destinationUrl, existing.linkId, campaignId)
            );
          } else if (generateShortlinks && linkId && slug) {
            dbStatements.push(
              env.DB.prepare(`
                INSERT INTO links (id, campaign_id, contact_id, slug, destination_url)
                VALUES (?, ?, ?, ?, ?)
              `).bind(linkId, campaignId, contactId, slug, destinationUrl)
            );
            existingByPhone.set(phone, { contactId, linkId, slug });
          }
        } else {
          // New contact and optionally new link
          dbStatements.push(
            env.DB.prepare(`
              INSERT INTO contacts (id, campaign_id, workspace_id, firstname, phone, extra_data)
              VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
              contactId, campaignId, workspaceId, firstname, phone,
              Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null
            )
          );

          if (generateShortlinks && linkId && slug) {
            dbStatements.push(
              env.DB.prepare(`
                INSERT INTO links (id, campaign_id, contact_id, slug, destination_url)
                VALUES (?, ?, ?, ?, ?)
              `).bind(linkId, campaignId, contactId, slug, destinationUrl)
            );
            existingByPhone.set(phone, { contactId, linkId, slug });
          } else {
            existingByPhone.set(phone, { contactId, linkId: null, slug: null });
          }
        }

        if (generateShortlinks && slug && linkId) {
          kvWrites.push({
            key: `${campaign.campaign_key}/${slug}`,
            slug,
            contactId,
            linkId,
          });
        }

        processed++;
      } catch (err) {
        console.error('Row processing error:', err);
        failed++;
      }
    }

    // Execute batch DB writes (use INSERT OR IGNORE to handle concurrent slug collisions)
    if (dbStatements.length > 0) {
      try {
        await env.DB.batch(dbStatements);
      } catch (err: any) {
        // If batch fails due to unique constraint, process rows individually
        if (err.message?.includes('UNIQUE constraint')) {
          for (const stmt of dbStatements) {
            try {
              await stmt.run();
            } catch {
              // Skip duplicate rows
            }
          }
        } else {
          throw err;
        }
      }
    }

    // Write KV entries in parallel chunks
    const endAt = campaign.end_at ? Math.floor(new Date(campaign.end_at).getTime() / 1000) : 0;
    const KV_CHUNK_SIZE = 50;
    for (let ki = 0; ki < kvWrites.length; ki += KV_CHUNK_SIZE) {
      const chunk = kvWrites.slice(ki, ki + KV_CHUNK_SIZE);
      await Promise.all(chunk.map(kv => {
        const kvData: KvLinkData = {
          d: campaign.base_url,
          f: campaign.fallback_url,
          c: campaignId,
          t: kv.contactId,
          l: kv.linkId,
          e: endAt,
          s: campaign.status,
        };
        return setLinkData(env.KV, campaign.campaign_key, kv.slug, kvData);
      }));
    }

    // Update progress
    await env.DB.prepare(`
      UPDATE csv_uploads SET processed_count = ?, failed_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(processed, failed, uploadId).run();
  }

  // Mark complete
  await env.DB.prepare(`
    UPDATE csv_uploads SET
      status = 'completed',
      processed_count = ?,
      failed_count = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(processed, failed, uploadId).run();
}

async function markUploadFailed(env: Env, uploadId: string, error: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE csv_uploads SET status = 'failed', error_message = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(error, uploadId).run();
}

/**
 * Parse a CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}
