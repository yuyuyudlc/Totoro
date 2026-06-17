# Token失效检测机制

## 功能说明

系统实现了全局的token失效自动检测机制。当任何需要认证的API接口返回 `success: false` 时，系统会自动：

1. **检测失效**：识别到token已失效
2. **清除状态**：清除本地存储的登录信息
3. **提示用户**：弹窗提示"登录已失效，请重新登录"
4. **自动跳转**：跳转到登录页面

## 实现原理

### 1. API请求拦截

在 `lib/api.js` 的 `request` 函数中添加了响应拦截逻辑：

```javascript
// 检测token失效：如果是需要认证的接口且返回success=false
if (options.requiresAuth !== false && data?.success === false) {
  const { default: useStore } = await import('./store.js');
  const { logout, isLoggedIn } = useStore.getState();
  
  if (isLoggedIn) {
    logout();
    alert('登录已失效，请重新登录');
    window.location.href = '/';
  }
}
```

### 2. 接口分类

- **需要认证的接口**（默认）：所有阳光跑相关接口
  - `/sunrun/submit` - 提交跑步记录
  - `/sunrun/records` - 获取跑步记录
  - `/sunrun/bulk` - 批量跑步
  - `/sunrun/bulk-v2` - 自选日期批量跑步

- **不需要认证的接口**（添加 `requiresAuth: false` 标记）：
  - `/login/qrcode` - 获取登录二维码
  - `/login/poll/{uuid}` - 轮询扫码状态
  - `/login/complete` - 完成登录

## 使用示例

### 正常流程

```javascript
// 用户已登录，token有效
const result = await getRunTask(authData);
// result.success === true
// 正常处理数据
```

### Token失效流程

```javascript
// 用户已登录，但token已过期
const result = await getRunTask(authData);
// result.success === false

// 系统自动触发：
// 1. 控制台输出: [Token失效] 检测到登录已失效，正在退出登录...
// 2. 清除登录状态
// 3. 弹窗提示: "登录已失效，请重新登录"
// 4. 跳转到登录页 "/"
```

## 优点

✅ **全局统一处理**：所有API调用都自动享有token失效检测  
✅ **用户体验友好**：自动清理状态并引导用户重新登录  
✅ **避免循环依赖**：使用动态import导入store  
✅ **灵活配置**：通过 `requiresAuth` 标记区分接口类型  

## 注意事项

1. **后端响应格式要求**：所有接口必须返回包含 `success` 字段的JSON响应
2. **登录接口除外**：登录相关接口应标记 `requiresAuth: false`
3. **避免误判**：只在用户已登录状态下才处理token失效
4. **控制台日志**：Token失效时会在控制台输出警告信息

## 测试建议

1. **正常登录**：验证正常流程不受影响
2. **Token过期**：等待token过期后访问需要认证的页面
3. **手动清除**：在控制台清除localStorage后访问
4. **刷新页面**：验证刷新后token失效检测仍然有效
