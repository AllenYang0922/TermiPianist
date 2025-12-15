import axios, { type AxiosStatic } from 'axios';
import handleError from './handleError';
import setConfig from './setConfig';

/**
 * request是基于axios创建的实例，实例只有常见的数据请求方法，没有axios.isCancel/ axios.CancelToken等方法，
 * 也就是没有**取消请求**和**批量请求**的方法。
 * 所以如果需要在实例中调用取消某个请求的方法（例如取消上传），请用intactRequest。
 */
const intactRequest: AxiosStatic = setConfig(axios);
const request = intactRequest.create();

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error && error.response) {
      console.log('error: ', error);
      handleError(error);
    }
    return Promise.reject(error);
  }
);

export default request;
