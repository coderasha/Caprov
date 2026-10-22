import type { AssetAddress } from '@caprov/types';

export const indiaStates = [
  ['AN', 'Andaman and Nicobar Islands'], ['AP', 'Andhra Pradesh'], ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'],
  ['BR', 'Bihar'], ['CG', 'Chhattisgarh'], ['CH', 'Chandigarh'], ['CT', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['DL', 'Delhi'], ['GA', 'Goa'], ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'], ['JK', 'Jammu and Kashmir'],
  ['JH', 'Jharkhand'], ['KA', 'Karnataka'], ['KL', 'Kerala'], ['LA', 'Ladakh'], ['LD', 'Lakshadweep'], ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'], ['MN', 'Manipur'], ['ML', 'Meghalaya'], ['MZ', 'Mizoram'], ['NL', 'Nagaland'], ['OD', 'Odisha'],
  ['PY', 'Puducherry'], ['PB', 'Punjab'], ['RJ', 'Rajasthan'], ['SK', 'Sikkim'], ['TN', 'Tamil Nadu'], ['TS', 'Telangana'],
  ['TR', 'Tripura'], ['UP', 'Uttar Pradesh'], ['UK', 'Uttarakhand'], ['WB', 'West Bengal'],
] as const;

type DirectoryAddress = Required<Pick<AssetAddress, 'stateCode' | 'stateName' | 'districtCode' | 'districtName' | 'subDistrictCode' | 'subDistrictName' | 'subDistrictLabel' | 'settlementName' | 'pinCode' | 'postOffice'>> & Pick<AssetAddress, 'locality'>;

// This local fixture supports offline development. Production imports replace it with
// versioned LGD and India Post records through the address-directory integration.
export const indiaAddressDirectory: DirectoryAddress[] = [
  { stateCode: 'KA', stateName: 'Karnataka', districtCode: 'KA-BLR-U', districtName: 'Bengaluru Urban', subDistrictCode: 'KA-BLR-U-BLR', subDistrictName: 'Bengaluru North', subDistrictLabel: 'Taluk', settlementName: 'Bengaluru', locality: 'Vasanth Nagar', pinCode: '560001', postOffice: 'Bengaluru GPO' },
  { stateCode: 'KA', stateName: 'Karnataka', districtCode: 'KA-MYS', districtName: 'Mysuru', subDistrictCode: 'KA-MYS-MYS', subDistrictName: 'Mysuru', subDistrictLabel: 'Taluk', settlementName: 'Mysuru', locality: 'Lakshmipuram', pinCode: '570004', postOffice: 'Lakshmipuram' },
  { stateCode: 'MH', stateName: 'Maharashtra', districtCode: 'MH-MUM', districtName: 'Mumbai', subDistrictCode: 'MH-MUM-MUM', subDistrictName: 'Mumbai', subDistrictLabel: 'Taluka', settlementName: 'Mumbai', locality: 'Fort', pinCode: '400001', postOffice: 'Mumbai GPO' },
  { stateCode: 'MH', stateName: 'Maharashtra', districtCode: 'MH-PUN', districtName: 'Pune', subDistrictCode: 'MH-PUN-HAV', subDistrictName: 'Haveli', subDistrictLabel: 'Taluka', settlementName: 'Pune', locality: 'Shivajinagar', pinCode: '411005', postOffice: 'Shivajinagar' },
  { stateCode: 'TS', stateName: 'Telangana', districtCode: 'TS-HYD', districtName: 'Hyderabad', subDistrictCode: 'TS-HYD-SHA', subDistrictName: 'Shaikpet', subDistrictLabel: 'Mandal', settlementName: 'Hyderabad', locality: 'Banjara Hills', pinCode: '500034', postOffice: 'Banjara Hills' },
  { stateCode: 'TN', stateName: 'Tamil Nadu', districtCode: 'TN-CHE', districtName: 'Chennai', subDistrictCode: 'TN-CHE-MAM', subDistrictName: 'Mambalam', subDistrictLabel: 'Taluk', settlementName: 'Chennai', locality: 'T. Nagar', pinCode: '600017', postOffice: 'Thyagaraya Nagar' },
  { stateCode: 'DL', stateName: 'Delhi', districtCode: 'DL-ND', districtName: 'New Delhi', subDistrictCode: 'DL-ND-ND', subDistrictName: 'New Delhi', subDistrictLabel: 'Sub-district', settlementName: 'New Delhi', locality: 'Connaught Place', pinCode: '110001', postOffice: 'New Delhi GPO' },
];

export function distinctOptions(items: DirectoryAddress[], key: keyof DirectoryAddress) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean) as string[])];
}
