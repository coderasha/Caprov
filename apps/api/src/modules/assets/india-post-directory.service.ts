import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

export interface IndiaPostOffice {
  pinCode: string;
  officeName: string;
  delivery: 'Delivery' | 'Non-Delivery';
  officeType: string;
  circle: string;
  region?: string;
  division?: string;
}

const stateByCircle: Record<string, { code: string; name: string }> = {
  'Andhra Pradesh': { code: 'AP', name: 'Andhra Pradesh' }, Assam: { code: 'AS', name: 'Assam' },
  Bihar: { code: 'BR', name: 'Bihar' }, Chhattisgarh: { code: 'CG', name: 'Chhattisgarh' },
  Delhi: { code: 'DL', name: 'Delhi' }, Gujarat: { code: 'GJ', name: 'Gujarat' }, Haryana: { code: 'HR', name: 'Haryana' },
  'Himachal Pradesh': { code: 'HP', name: 'Himachal Pradesh' }, 'Jammu & Kashmir': { code: 'JK', name: 'Jammu and Kashmir' },
  Jharkhand: { code: 'JH', name: 'Jharkhand' }, Karnataka: { code: 'KA', name: 'Karnataka' }, Kerala: { code: 'KL', name: 'Kerala' },
  'Madhya Pradesh': { code: 'MP', name: 'Madhya Pradesh' }, Maharashtra: { code: 'MH', name: 'Maharashtra' },
  Odisha: { code: 'OD', name: 'Odisha' }, Punjab: { code: 'PB', name: 'Punjab' }, Rajasthan: { code: 'RJ', name: 'Rajasthan' },
  Tamilnadu: { code: 'TN', name: 'Tamil Nadu' }, Telangana: { code: 'TS', name: 'Telangana' },
  'Uttar Pradesh': { code: 'UP', name: 'Uttar Pradesh' }, Uttarakhand: { code: 'UK', name: 'Uttarakhand' },
  'West Bengal': { code: 'WB', name: 'West Bengal' },
};

function directoryFile(name: string) {
  const candidates = [resolve(process.cwd(), 'data', name), resolve(process.cwd(), 'apps/api/data', name)];
  return candidates.find(existsSync) ?? candidates[0]!;
}

@Injectable()
export class IndiaPostDirectoryService {
  private readonly filePath = directoryFile('india-post-directory.json');
  private cache: IndiaPostOffice[] | undefined;

  lookup(pinCode: string) {
    const offices = this.load().filter((office) => office.pinCode === pinCode);
    const state = offices[0] ? stateByCircle[offices[0].circle] : undefined;
    return {
      pinCode,
      source: 'INDIA_POST' as const,
      sourceVersion: 'India Post circle-directory import',
      stateCode: state?.code,
      stateName: state?.name,
      postalCandidates: offices,
    };
  }

  private load() {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) return (this.cache = []);
    try {
      return (this.cache = JSON.parse(readFileSync(this.filePath, 'utf8')) as IndiaPostOffice[]);
    } catch {
      return (this.cache = []);
    }
  }
}
