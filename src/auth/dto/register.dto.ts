import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsString() @Length(1, 120) displayName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString()
  @Length(12, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'password must include upper, lower, and numeric characters',
  })
  password!: string;
  @IsString() @MaxLength(120) deviceName = 'Unknown device';
}
