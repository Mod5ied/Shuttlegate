#import "SecureStorageModule.h"
#import <Security/Security.h>

static NSString *const kServiceName = @"com.shuttlegate.securestorage";

@implementation SecureStorageModule

+ (NSString *)name {
  return @"SecureStorageModule";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{
    @"setSecureItem": NSStringFromSelector(@selector(setSecureItem:value:)),
    @"getSecureItem": NSStringFromSelector(@selector(getSecureItem:callback:)),
    @"deleteSecureItem": NSStringFromSelector(@selector(deleteSecureItem:)),
  };
}

- (NSMutableDictionary *)baseQueryForKey:(NSString *)key {
  return [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: kServiceName,
    (__bridge id)kSecAttrAccount: key,
  } mutableCopy];
}

- (void)setSecureItem:(NSString *)key value:(NSString *)value {
  if (!key || !value) return;

  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];

  // Delete any existing item first.
  NSMutableDictionary *deleteQuery = [self baseQueryForKey:key];
  SecItemDelete((__bridge CFDictionaryRef)deleteQuery);

  NSMutableDictionary *addQuery = [self baseQueryForKey:key];
  addQuery[(__bridge id)kSecValueData] = data;
  addQuery[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;

  SecItemAdd((__bridge CFDictionaryRef)addQuery, NULL);
}

- (void)getSecureItem:(NSString *)key callback:(void(^)(NSString *_Nullable value))callback {
  if (!key) {
    callback(nil);
    return;
  }

  NSMutableDictionary *query = [self baseQueryForKey:key];
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  query[(__bridge id)kSecReturnData] = (__bridge id)kCFBooleanTrue;

  CFDataRef dataRef = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, (CFTypeRef *)&dataRef);

  if (status == errSecSuccess && dataRef) {
    NSData *data = (__bridge_transfer NSData *)dataRef;
    NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    callback(value);
  } else {
    callback(nil);
  }
}

- (void)deleteSecureItem:(NSString *)key {
  if (!key) return;
  NSMutableDictionary *query = [self baseQueryForKey:key];
  SecItemDelete((__bridge CFDictionaryRef)query);
}

@end
