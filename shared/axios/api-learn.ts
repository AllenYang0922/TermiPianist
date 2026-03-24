import request from './index';

/**
 * 获取演奏历史列表
 */
export function getHistoryList() {
  const url = '/api/history';
  return request.get(url).then((res) => res.data);
}

// 开始演奏
export function startLearning() {
  const url = '/api/learning/start';
  return request.post(url).then((res) => res.data);
}

// 结束演奏
export function endLearning() {
  const url = '/api/learning/end';
  return request.post(url).then((res) => res.data);
}

// 停止演奏
export async function stopPerform() {
  const url = '/api/performance/stop';
  const res = await request.post(url);
  return res.data;
}

// 调整演奏速度
export async function adjustPerformanceSpeed(speed: number) {
  const url = '/api/performance/speed';
  const res = await request.post(url, { bpm:speed });
  return res.data;
}

// 获取歌曲清单
export async function getSongList() {
  const url = '/api/available_songs';
  const res = await request.get(url);
  return res.data;
}