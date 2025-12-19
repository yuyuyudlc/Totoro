/**
 * 跑步数据状态管理
 */
import { create } from 'zustand';

const useRunStore = create((set) => ({
  // 任务数据
  task: null,
  taskLoading: false,
  taskError: null,
  
  // 提交状态
  submitting: false,
  submitResult: null,
  
  // 记录列表
  records: [],
  recordsLoading: false,
  
  // 设置任务
  setTask: (task) => set({ task, taskError: null }),
  setTaskLoading: (loading) => set({ taskLoading: loading }),
  setTaskError: (error) => set({ taskError: error }),
  
  // 设置提交状态
  setSubmitting: (submitting) => set({ submitting }),
  setSubmitResult: (result) => set({ submitResult: result }),
  clearSubmitResult: () => set({ submitResult: null }),
  
  // 设置记录
  setRecords: (records) => set({ records }),
  setRecordsLoading: (loading) => set({ recordsLoading: loading }),
  
  // 重置
  reset: () => set({
    task: null,
    taskLoading: false,
    taskError: null,
    submitting: false,
    submitResult: null,
    records: [],
    recordsLoading: false,
  }),
}));

export default useRunStore;
