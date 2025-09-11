export interface CognitoUserAttributes {
  Name: string;
  Value?: string;
}

export interface CognitoUser {
  UserAttributes?: CognitoUserAttributes[];
}

export interface TransformedUser {
  name: string;
  nickname: string;
  preferred_username: string;
  avatar_url: string;
}

export class UserTransformationUtil {
  /**
   * Cognito 사용자 데이터를 표준 형식으로 변환
   * @param cognitoUser Cognito 사용자 객체
   * @param userSub 사용자 식별자
   * @returns 변환된 사용자 데이터
   */
  static transformCognitoUser(cognitoUser: CognitoUser | null, userSub: string): TransformedUser {
    if (!cognitoUser?.UserAttributes) {
      return this.getDefaultUserData(userSub);
    }

    const attributes = cognitoUser.UserAttributes;
    
    const name = attributes.find((attr) => attr.Name === 'name')?.Value || '';
    const nickname = attributes.find((attr) => attr.Name === 'nickname')?.Value || '';
    const preferredUsername = attributes.find((attr) => attr.Name === 'preferred_username')?.Value || '';
    const picture = attributes.find((attr) => attr.Name === 'picture')?.Value || '';

    return {
      name: name || `User ${userSub.slice(-4)}`,
      nickname: nickname || `user_${userSub.slice(-8)}`,
      preferred_username: preferredUsername || nickname || `user_${userSub.slice(-8)}`,
      avatar_url: picture || '/profile-90.png',
    };
  }

  /**
   * 기본 사용자 데이터 생성
   * @param userSub 사용자 식별자
   * @returns 기본 사용자 데이터
   */
  static getDefaultUserData(userSub: string): TransformedUser {
    return {
      name: `User ${userSub.slice(-4)}`,
      nickname: `user_${userSub.slice(-8)}`,
      preferred_username: `user_${userSub.slice(-8)}`,
      avatar_url: '/profile-90.png',
    };
  }

  /**
   * 여러 사용자를 한 번에 변환 (성능 최적화)
   * @param users Cognito 사용자 배열과 userSub 매핑
   * @returns 변환된 사용자 데이터 Map
   */
  static transformMultipleCognitoUsers(
    users: Array<{ userSub: string; cognitoUser: CognitoUser | null }>
  ): Map<string, TransformedUser> {
    const result = new Map<string, TransformedUser>();
    
    users.forEach(({ userSub, cognitoUser }) => {
      result.set(userSub, this.transformCognitoUser(cognitoUser, userSub));
    });
    
    return result;
  }

  /**
   * 사용자 데이터를 camelCase 형식으로 변환 (API 응답용)
   * @param user 변환된 사용자 데이터
   * @param userSub 사용자 식별자
   * @returns camelCase 형식의 사용자 데이터
   */
  static toCamelCaseFormat(user: TransformedUser, userSub: string) {
    return {
      id: userSub,
      name: user.name,
      handle: user.preferred_username,
      avatar: user.avatar_url,
    };
  }
}