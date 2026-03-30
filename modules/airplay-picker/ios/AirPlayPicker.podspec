require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AirPlayPicker'
  s.version        = package['version']
  s.summary        = 'Native AVRoutePickerView wrapper for Expo'
  s.license        = 'MIT'
  s.author         = 'Cinescenes'
  s.homepage       = 'https://github.com/cinescenes'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  unless defined?(install_modules_dependencies)
    require File.join(File.dirname(`node --print "require.resolve('react-native/package.json')"`), "scripts/react_native_pods")
  end
  install_modules_dependencies(s)

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }

  s.source_files = '**/*.{h,m,swift}'
end
