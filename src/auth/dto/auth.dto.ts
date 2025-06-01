import { IsString, IsNotEmpty, IsEmail, MinLength } from "class-validator";

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
  @IsString()
  @IsNotEmpty()
  userSub: string;
}
