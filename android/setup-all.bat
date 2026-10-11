@echo off
echo Downloading JDK 17...
powershell -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_windows-x64_bin.zip' -OutFile 'jdk.zip'"

echo Extracting JDK...
powershell -Command "Expand-Archive -Path 'jdk.zip' -DestinationPath 'jdk_temp' -Force"
move jdk_temp\jdk-17.0.2 jdk
rmdir /s /q jdk_temp
del jdk.zip

set JAVA_HOME=%CD%\jdk
set PATH=%JAVA_HOME%\bin;%PATH%

echo JAVA_HOME set to %JAVA_HOME%

echo Generating wrapper using existing gradle_temp...
:: First try to run the gradle command to generate wrapper
call gradle_temp\gradle-8.7\bin\gradle.bat wrapper

echo Testing gradlew...
call gradlew.bat --version

echo Done! 
