<#
.SYNOPSIS
  Crea el icono "Passo" en el escritorio: un clic arranca el servidor y abre la aplicación.

.DESCRIPTION
  Si mueves la carpeta del proyecto, vuelve a ejecutar este script (el icono apunta a esta carpeta).
  El dibujo del icono sale de scripts/generar_icono.py.
#>
$ErrorActionPreference = "Stop"
$scripts = $PSScriptRoot
$launcher = Join-Path $scripts "iniciar_passo.ps1"
$icon = Join-Path $scripts "passo.ico"
$desktop = [Environment]::GetFolderPath("Desktop")

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop "Passo.lnk"))
$link.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$link.WorkingDirectory = Split-Path -Parent $scripts
$link.IconLocation = "$icon,0"
$link.Description = "Abre Passo en el navegador"
$link.WindowStyle = 7  # minimizada: no se ve la ventana de PowerShell
$link.Save()

Write-Host "Icono creado: $(Join-Path $desktop "Passo.lnk")"
