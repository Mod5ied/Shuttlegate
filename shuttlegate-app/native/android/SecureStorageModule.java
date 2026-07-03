package com.shuttlegate.nativemodules;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import com.lynx.react.bridge.Callback;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.module.LynxModule;

public class SecureStorageModule extends LynxModule {
  private static final String PREFS_FILE = "shuttlegate_secure_prefs";
  private EncryptedSharedPreferences encryptedPrefs;

  public SecureStorageModule(Context context) {
    super(context);
    try {
      MasterKey masterKey = new MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build();
      encryptedPrefs = (EncryptedSharedPreferences) EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      );
    } catch (Exception e) {
      throw new RuntimeException("Failed to initialize secure storage", e);
    }
  }

  @LynxMethod
  public void setSecureItem(String key, String value) {
    if (encryptedPrefs != null && key != null && value != null) {
      encryptedPrefs.edit().putString(key, value).apply();
    }
  }

  @LynxMethod
  public void getSecureItem(String key, Callback callback) {
    if (encryptedPrefs == null || key == null) {
      callback.invoke(null);
      return;
    }
    String value = encryptedPrefs.getString(key, null);
    callback.invoke(value);
  }

  @LynxMethod
  public void deleteSecureItem(String key) {
    if (encryptedPrefs != null && key != null) {
      encryptedPrefs.edit().remove(key).apply();
    }
  }
}
