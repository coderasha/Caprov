#!/usr/bin/env node
/**
 * Downloads India Post's published postal-circle PDFs and creates the local
 * PIN/post-office lookup consumed by the API. This is intentionally generated
 * data (apps/api/data is gitignored), not a hand-maintained application list.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const origin = 'https://www.indiapost.gov.in';
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; CAPROV-address-directory/1.0)' };
const work = mkdtempSync(join(tmpdir(), 'caprov-india-post-'));
const pause = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function download(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === 4) {
      throw new Error(`Could not download ${url}: ${response.status}`);
    }
    await pause((attempt + 1) * 10_000);
  }
  throw new Error(`Could not download ${url}`);
}

try {
  const index = await (await fetch(`${origin}/rti/pincodelist`, { headers })).text();
  const links = [...new Set([...index.matchAll(/\/api\/documents\/file\/[a-z0-9]+/gi)].map((match) => match[0]))];
  if (links.length < 20) throw new Error(`Expected India Post circle directories; found ${links.length}.`);
  const rows = [];
  for (const [indexNumber, link] of links.entries()) {
    const pdf = join(work, `${indexNumber}.pdf`);
    const text = join(work, `${indexNumber}.txt`);
    const response = await download(`${origin}${link}`);
    writeFileSync(pdf, Buffer.from(await response.arrayBuffer()));
    execFileSync('pdftotext', ['-layout', pdf, text]);
    for (const line of readFileSync(text, 'utf8').split('\n')) {
      const match = line.trim().match(/^(.*?)\s+(\d{6})\s+(Delivery|Non-Delivery)\s+([A-Z.]+)\s+(.+?) Circle\s+(.+?) Region\s+(.+?) Division\s*$/);
      if (!match) continue;
      rows.push({ officeName: match[1].trim(), pinCode: match[2], delivery: match[3], officeType: match[4], circle: match[5].trim(), region: match[6].trim(), division: match[7].trim() });
    }
    process.stdout.write(`Imported circle ${indexNumber + 1}/${links.length}\n`);
    await pause(3_000);
  }
  const deduplicated = [...new Map(rows.map((row) => [`${row.pinCode}:${row.officeName}:${row.circle}`, row])).values()];
  const destination = resolve('apps/api/data/india-post-directory.json');
  mkdirSync(resolve('apps/api/data'), { recursive: true });
  writeFileSync(destination, JSON.stringify(deduplicated));
  console.log(`Wrote ${deduplicated.length} India Post office records to ${destination}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
