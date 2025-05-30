export class SignUpDto {
  email: string;
  password: string;
  name: string;
}

export class SignInDto {
  email: string;
  password: string;
}

export class SignOutDto {
  accessToken: string;
}
