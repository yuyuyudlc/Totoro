import nextEnv from '@next/env';
import { createRunWorker } from '../lib/server/sunrun/run-queue.js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

let service;
try {
  service = createRunWorker();
} catch (error) {
  console.error(`真实延迟队列 Worker 启动失败: ${error.message}`);
  process.exitCode = 1;
}

if (service) {
  service.worker.on('ready', () => {
    console.log('真实延迟队列 Worker 已连接 Redis');
  });
  service.worker.on('completed', job => {
    console.log(`延迟任务 ${job.id} 已完成`);
  });
  service.worker.on('failed', (job, error) => {
    console.error(`延迟任务 ${job?.id || 'unknown'} 失败: ${error.message}`);
  });
  service.worker.on('error', error => {
    console.error(`真实延迟队列 Worker 错误: ${error.message}`);
  });

  let closing = false;
  async function shutdown(signal) {
    if (closing) return;
    closing = true;
    console.log(`收到 ${signal}，正在关闭真实延迟队列 Worker`);
    try {
      await service.close();
    } catch (error) {
      console.error(`关闭 Worker 失败: ${error.message}`);
      process.exitCode = 1;
    }
  }

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}
