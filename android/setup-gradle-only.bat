@echo off
set JAVA_HOME=%CD%\jdk
set PATH=%JAVA_HOME%\bin;%PATH%

echo Downloading Gradle 8.7...
powershell -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-8.7-bin.zip' -OutFile 'gradle.zip'"
echo Extracting Gradle...
powershell -Command "Expand-Archive -Path 'gradle.zip' -DestinationPath 'gradle_temp' -Force"
echo Generating wrapper...
call gradle_temp\gradle-8.7\bin\gradle.bat wrapper
echo Cleaning up Gradle temp files...
del gradle.zip
rmdir /s /q gradle_temp

echo Testing gradlew...
call gradlew.bat --version

echo Done! You can now run gradlew assembleDebug by prefixing it with the JAVA_HOME set.
