import type { AxiosError } from 'axios';
import { toast } from 'sonner';

/* function getErrorCodeMsg(code: string, statusCode: number) {
  const codeKey = String(code).replace(/'/g, '').replace(/_(\w)/g, (_, letter) => letter.toUpperCase());
  let msg = t(`response.${codeKey}`);
  if (msg === `response.${codeKey}`) {
    msg = t(`response.statusCode${statusCode}`);
  }

  return msg;
} */

export default (err: AxiosError) => {
  const { response } = err;

  if (response) {
    const data = response.data as { code: string; data: any; msg: string };

    switch (response && response.status) {
      case 400:
        err.code = data.code ?? String(response.status);
        err.message = '请求错误(400)';
        break;
      case 401:
        err.message = '登录过期，请重新登录(401)';
        break;
      case 403:
        err.message = '拒绝访问(403)';
        break;
      case 404:
        err.code = data?.code ?? String(response.status);
        err.message = '请求错误(404)';
        break;
      case 408:
        err.message = '请求超时(408)';
        break;
      case 418:
        err.message = '您的请求疑似攻击行为(418)';
        break;
      case 500:
        err.message = '服务器错误(500)';
        break;
      case 501:
        err.message = '服务未实现(501)';
        break;
      case 502:
        err.message = '网关错误(502)';
        break;
      case 503:
        err.message = '服务不可用(503)';
        break;
      case 504:
        err.message = '网络超时(504)';
        break;
      case 505:
        err.message = 'HTTP版本不受支持(505)';
        break;
      default:
        err.message = `其他错误：(${response.status})!`;
    }

    // 显示错误提示
    if (err.message) {
      toast.error(err.message);
    }
  }

  return err;
};
