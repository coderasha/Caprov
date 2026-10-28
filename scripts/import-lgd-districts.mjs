#!/usr/bin/env node
/** Fetches the LGD-derived national district directory into local runtime data. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = 'https://india-lgd-index-api.vercel.app';
const [statesResponse, districtsResponse] = await Promise.all([
  fetch(`${origin}/v1/states`),
  fetch(`${origin}/v1/districts`),
]);
if (!statesResponse.ok || !districtsResponse.ok) throw new Error('Could not download the LGD directory.');
const states = (await statesResponse.json()).data;
const districts = (await districtsResponse.json()).data;
const stateNames = new Map(states.map((state) => [String(state.code), state.name]));
const normalized = districts
  .map((district) => ({ code: String(district.code), name: district.name, stateName: stateNames.get(String(district.state_code)) }))
  .filter((district) => district.stateName)
  .sort((left, right) => left.stateName.localeCompare(right.stateName, 'en') || left.name.localeCompare(right.name, 'en'));
mkdirSync(resolve('apps/api/data'), { recursive: true });
writeFileSync(resolve('apps/api/data/lgd-districts.json'), JSON.stringify(normalized));
console.log(`Wrote ${normalized.length} LGD district records.`);

const subDistrictBatches = [];
for (const state of states) {
  const response = await fetch(`${origin}/v1/subdistricts?state=${state.code}`);
  if (!response.ok) throw new Error(`Could not download LGD sub-districts for ${state.name}.`);
  subDistrictBatches.push((await response.json()).data);
}
const subDistricts = subDistrictBatches.flat()
  .map((subDistrict) => ({ code: String(subDistrict.code), name: subDistrict.name, districtCode: String(subDistrict.district_code), stateCode: String(subDistrict.state_code) }))
  .sort((left, right) => left.districtCode.localeCompare(right.districtCode, 'en') || left.name.localeCompare(right.name, 'en'));
writeFileSync(resolve('apps/api/data/lgd-subdistricts.json'), JSON.stringify(subDistricts));
console.log(`Wrote ${subDistricts.length} LGD sub-district records.`);
