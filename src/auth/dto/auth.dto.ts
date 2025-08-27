import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsPhoneNumber,
} from "class-validator";

export class SignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber("KR")
  phoneNumber: string;
}

export class SignInDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SignOutDto {
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

export class ConfirmSignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  confirmationCode: string;
}

export class ResendConfirmationCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
