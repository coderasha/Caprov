import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that a string is a valid Ethereum transaction hash (0x + 64 hex chars)
 * @example
 * class MyDto {
 *   @IsTransactionHash()
 *   transactionHash: string;
 * }
 */
@ValidatorConstraint({ name: 'IsTransactionHash', async: false })
export class IsTransactionHashConstraint implements ValidatorConstraintInterface {
  private readonly TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

  validate(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return this.TX_HASH_REGEX.test(value);
  }

  defaultMessage(): string {
    return 'transactionHash must be a valid Ethereum transaction hash (0x followed by 64 hexadecimal characters)';
  }
}

export function IsTransactionHash(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsTransactionHashConstraint,
    });
  };
}
