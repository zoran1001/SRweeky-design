# 听风阁剧本杀 - 自动推送脚本
# 使用方法：右键点击此文件，选择"使用 PowerShell 运行"

$repoPath = "C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a28d8727aa1b4af47e6db7c\tingfengge"
$remoteUrl = "https://github.com/zoran1001/jubensha.git"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  听风阁剧本杀 - GitHub自动推送工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查目录是否存在
if (-not (Test-Path $repoPath)) {
    Write-Host "错误：找不到项目目录！" -ForegroundColor Red
    Write-Host "路径：$repoPath" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

# 进入项目目录
Set-Location $repoPath

# 检查是否是git仓库
if (-not (Test-Path ".git")) {
    Write-Host "初始化Git仓库..." -ForegroundColor Yellow
    git init
    git remote add origin $remoteUrl
}

# 检查远程仓库地址
try {
    $currentRemote = git remote get-url origin 2>$null
    if ($currentRemote -ne $remoteUrl) {
        Write-Host "更新远程仓库地址..." -ForegroundColor Yellow
        git remote remove origin 2>$null
        git remote add origin $remoteUrl
    }
} catch {
    git remote add origin $remoteUrl
}

# 显示当前状态
Write-Host "当前Git状态：" -ForegroundColor Green
git status --short
Write-Host ""

# 询问提交信息
$defaultMessage = "更新于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$commitMessage = Read-Host "请输入提交信息（直接回车使用默认：'$defaultMessage'）"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = $defaultMessage
}

# 添加所有更改
Write-Host ""
Write-Host "正在添加文件..." -ForegroundColor Yellow
git add .

# 提交更改
Write-Host "正在提交更改..." -ForegroundColor Yellow
git commit -m "$commitMessage"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "没有需要提交的更改，或提交失败。" -ForegroundColor Yellow
    $continue = Read-Host "是否仍要推送？ (y/n)"
    if ($continue -ne "y") {
        Write-Host "已取消推送。" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 0
    }
}

# 推送到GitHub
Write-Host ""
Write-Host "正在推送到GitHub..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  推送成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "访问地址：" -ForegroundColor Cyan
    Write-Host "  https://zoran1001.github.io/jubensha/" -ForegroundColor White
    Write-Host ""
    Write-Host "GitHub仓库：" -ForegroundColor Cyan
    Write-Host "  https://github.com/zoran1001/jubensha" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  推送失败，请检查网络或GitHub登录状态" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Write-Host ""
Read-Host "按回车键退出"
