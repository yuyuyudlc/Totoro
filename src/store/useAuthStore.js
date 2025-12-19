/**
 * 认证状态管理
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      // 状态
      isLoggedIn: false,
      userInfo: null,
      token: '',
      stuNumber: '',
      schoolId: '',
      campusId: '',
      campusName: '',
      
      // 登录
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
      
      // 登出
      logout: () => {
        set({
          isLoggedIn: false,
          userInfo: null,
          token: '',
          stuNumber: '',
          schoolId: '',
          campusId: '',
          campusName: '',
        });
      },
      
      // 获取认证数据
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
    }),
    {
      name: 'totoro-auth',
    }
  )
);

export default useAuthStore;
