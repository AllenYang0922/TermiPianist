import request from './index';

/**
 * 获取演奏历史列表
 */
export function getHistoryList() {
  const url = '/api/history';
  return request.get(url).then((res) => res.data);
}

// 结束演奏
export function startLearning() {
  const url = '/api/learning/start';
  return request.post(url).then((res) => res.data);
}

// 结束演奏
export function endLearning() {
  const url = '/api/learning/end';
  return request.post(url).then((res) => res.data);
}