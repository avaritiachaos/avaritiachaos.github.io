@echo off
setlocal enabledelayedexpansion

:: 一键部署Hugo网站到GitHub Pages脚本
:: 作者：Claude
:: 创建日期：2025年6月13日

echo [92m===== 开始部署 Tokisaka 博客 =====[0m
echo [36m当前时间: %date% %time%[0m

:: 确定Hugo根目录
set "scriptDir=%~dp0"
set "hugoRoot=%scriptDir%"

:: 检查当前目录是否是Hugo根目录
if not exist "%hugoRoot%config.yaml" (
    if not exist "%hugoRoot%config.toml" (
        :: 如果脚本在content/post目录下，则向上两级
        for %%I in ("%hugoRoot%.") do set "folderName=%%~nxI"
        if "!folderName!"=="post" (
            for %%I in ("%hugoRoot%..\") do set "parentFolder=%%~nxI"
            if "!parentFolder!"=="content" (
                set "hugoRoot=%hugoRoot%..\..\"
            )
        )
    )
)

:: 如果仍然找不到Hugo根目录，使用硬编码的路径
if not exist "%hugoRoot%config.yaml" (
    if not exist "%hugoRoot%config.toml" (
        echo [93m无法自动确定Hugo根目录，使用默认路径...[0m
        set "hugoRoot=D:\toko\Tokisaka\"
    )
)

:: 切换到Hugo根目录
cd /d "%hugoRoot%"
echo [93m当前工作目录: %cd%[0m

echo [93m步骤 1: 构建Hugo网站...[0m

:: 构建Hugo网站
hugo -D
if %ERRORLEVEL% neq 0 (
    echo [91mHugo构建失败，请检查错误信息。[0m
    pause
    exit /b 1
)

echo [92mHugo构建成功！[0m
echo [93m步骤 2: 进入public目录准备提交更改...[0m

:: 进入public目录
cd /d "%hugoRoot%public"

:: 检查Git状态
git status --porcelain > temp_status.txt
set /p gitStatus=<temp_status.txt
del temp_status.txt

if defined gitStatus (
    echo [93m检测到文件更改，准备提交...[0m
    
    :: 添加所有更改
    git add .
    
    :: 提交更改，使用当前日期时间作为提交信息
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do (set mytime=%%a:%%b)
    set "commitMessage=网站更新: !mydate! !mytime!"
    git commit -m "!commitMessage!"
    
    :: 推送到GitHub
    echo [93m步骤 3: 推送更改到GitHub...[0m
    git push
    
    :: 检查推送是否成功
    if %ERRORLEVEL% neq 0 (
        echo [91m推送到GitHub失败，请检查错误信息。[0m
        pause
        exit /b 1
    )
    
    echo [92m成功推送到GitHub！[0m
    echo [36m提交信息: !commitMessage![0m
) else (
    echo [36m没有检测到文件更改，无需提交。[0m
)

:: 返回原目录
cd /d "%hugoRoot%"

echo [92m===== 部署完成！ =====[0m
echo [36m你的网站应该很快就会更新。[0m
echo [36m网站地址: https://tokisaka.top[0m

:: 暂停
pause 