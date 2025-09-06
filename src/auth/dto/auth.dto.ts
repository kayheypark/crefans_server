import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  Matches,
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

export class ConfirmEmailVerificationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}

export class UpdateNicknameDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: '닉네임은 최소 2자 이상이어야 합니다.' })
  @MaxLength(20, { message: '닉네임은 최대 20자까지 가능합니다.' })
  nickname: string;
}

export class UpdateHandleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: '핸들은 최소 3자 이상이어야 합니다.' })
  @MaxLength(30, { message: '핸들은 최대 30자까지 가능합니다.' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '핸들은 영문, 숫자, 언더스코어만 사용 가능합니다.' })
  preferredUsername: string;
}
