const os = file.name.match(/\.(apk|aab)$/) ? 'android' : file.name.match(/.ipa$/) ? 'ios' : null;
