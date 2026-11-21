export const REAL_DEVICE_PROFILES = Object.freeze([
  Object.freeze({ id: 'iphone-14-pro', brand: 'iPhone', model: 'iPhone 14 Pro<iPhone15,2>', system: 'iOS 17.5.1', version: '8.0.50' }),
  Object.freeze({ id: 'iphone-13', brand: 'iPhone', model: 'iPhone 13<iPhone14,5>', system: 'iOS 16.6.1', version: '8.0.49' }),
  Object.freeze({ id: 'iphone-15', brand: 'iPhone', model: 'iPhone 15<iPhone15,4>', system: 'iOS 17.4.1', version: '8.0.50' }),
  Object.freeze({ id: 'xiaomi-23049rad8c', brand: 'Xiaomi', model: '23049RAD8C', system: 'Android 14', version: '8.0.49' }),
  Object.freeze({ id: 'xiaomi-22011211c', brand: 'Xiaomi', model: '22011211C', system: 'Android 13', version: '8.0.48' }),
  Object.freeze({ id: 'vivo-v2307a', brand: 'vivo', model: 'V2307A', system: 'Android 14', version: '8.0.48' }),
  Object.freeze({ id: 'honor-any-an00', brand: 'HONOR', model: 'ANY-AN00', system: 'Android 13', version: '8.0.47' }),
]);

export function formatDeviceProfile(profile) {
  return {
    id: profile.id,
    version: profile.version,
    phoneInfo: `${profile.brand}&${profile.model}&${profile.system}`,
    deviceModel: `${profile.brand} ${profile.model.split('<')[0]} (${profile.system})`,
  };
}

export function findDeviceProfile(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId.trim()) return null;
  const matched = REAL_DEVICE_PROFILES.find(profile => profile.id === deviceId.trim());
  return matched ? formatDeviceProfile(matched) : null;
}
