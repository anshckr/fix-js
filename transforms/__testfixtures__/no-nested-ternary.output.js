const os = function() {
  if (file.name.match(/\.(apk|aab)$/)) {
    return 'android';
  } else {
    if (file.name.match(/.ipa$/)) {
      return 'ios';
    } else {
      return null;
    }
  }
}();
