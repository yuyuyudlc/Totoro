/**
 * 全局状态管理 - 合并认证 + 跑步状态
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // ========== 认证状态 ==========
      isLoggedIn: false,
      userInfo: null,
      token: '',
      stuNumber: '',
      schoolId: '',
      campusId: '',
      campusName: '',

      login: (data) => {
        set({
          isLoggedIn: true,
          userInfo: data,
          token: data.token,
          stuNumber: data.stuNumber,
          schoolId: data.schoolId,
          campusId: data.campusId,
          campusName: data.campusName,
        });
      },

      logout: () => {
        set({
          isLoggedIn: false,
          userInfo: null,
          token: '',
          stuNumber: '',
          schoolId: '',
          campusId: '',
          campusName: '',
          // 同时清理跑步状态
          submitting: false,
          submitResult: null,
          records: [],
          recordsLoading: false,
        });
      },

      getAuthData: () => {
        const state = get();
        return {
          token: state.token,
          stuNumber: state.stuNumber,
          schoolId: state.schoolId,
          campusId: state.campusId,
          campusName: state.campusName,
        };
      },

      // ========== 跑步状态 ==========
      submitting: false,
      submitResult: null,
      records: [],
      recordsLoading: false,

      setSubmitting: (submitting) => set({ submitting }),
      setSubmitResult: (result) => set({ submitResult: result }),
      clearSubmitResult: () => set({ submitResult: null }),

      setRecords: (records) => set({ records }),
      setRecordsLoading: (loading) => set({ recordsLoading: loading }),
    }),
    {
      name: 'totoro-store',
      // 只持久化认证数据
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        userInfo: state.userInfo,
        token: state.token,
        stuNumber: state.stuNumber,
        schoolId: state.schoolId,
        campusId: state.campusId,
        campusName: state.campusName,
      }),
    }
  )
);

export default useStore;
