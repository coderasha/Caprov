import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

export interface LgdDistrict { code: string; name: string; stateName: string }
export interface LgdSubDistrict { code: string; name: string; districtCode: string; stateCode: string }

function directoryFile(name: string) {
  const candidates = [resolve(process.cwd(), 'data', name), resolve(process.cwd(), 'apps/api/data', name)];
  return candidates.find(existsSync) ?? candidates[0]!;
}

@Injectable()
export class LgdDirectoryService {
  private readonly filePath = directoryFile('lgd-districts.json');
  private readonly subDistrictFilePath = directoryFile('lgd-subdistricts.json');
  private cache: LgdDistrict[] | undefined;
  private subDistrictCache: LgdSubDistrict[] | undefined;

  districtsForState(stateName: string) {
    return this.load()
      .filter((district) => district.stateName.localeCompare(stateName, 'en', { sensitivity: 'base' }) === 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  }

  subDistrictsForDistrict(districtCode: string) {
    return this.loadSubDistricts()
      .filter((subDistrict) => subDistrict.districtCode === districtCode)
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  }

  private load() {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) return (this.cache = []);
    try {
      return (this.cache = JSON.parse(readFileSync(this.filePath, 'utf8')) as LgdDistrict[]);
    } catch {
      return (this.cache = []);
    }
  }

  private loadSubDistricts() {
    if (this.subDistrictCache) return this.subDistrictCache;
    if (!existsSync(this.subDistrictFilePath)) return (this.subDistrictCache = []);
    try {
      return (this.subDistrictCache = JSON.parse(readFileSync(this.subDistrictFilePath, 'utf8')) as LgdSubDistrict[]);
    } catch {
      return (this.subDistrictCache = []);
    }
  }
}
