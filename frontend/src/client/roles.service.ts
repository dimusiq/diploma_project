// Роли: GET /api/v1/roles/ (добавлено вручную до регенерации клиента из OpenAPI)

import type { CancelablePromise } from './core/CancelablePromise';
import { OpenAPI } from './core/OpenAPI';
import { request as __request } from './core/request';
import type { RolePublic } from './types.gen';

export class RolesService {
  /**
   * Список ролей (для выбора при создании/редактировании пользователя).
   */
  public static readRoles(): CancelablePromise<Array<RolePublic>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/api/v1/roles/',
    });
  }
}
