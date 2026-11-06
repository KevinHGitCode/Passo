<#
.SYNOPSIS
  Abre Passo en el navegador: arranca el servidor si hace falta y espera a que responda.

.DESCRIPTION
  Pensado para el icono del escritorio (ver crear_icono_escritorio.ps1). Si Passo ya está en marcha
  solo abre el navegador. El puerto es fijo (5173): el navegador guarda tu progreso y tus ajustes por
  dirección, así que cambiar de puerto los dejaría atrás.
  El servidor queda en una ventana minimizada: cerrarla lo detiene.

.PARAMETER SinNavegador
  No abre el navegador (para comprobar que el servidor arranca).
#>
param([switch]$SinNavegador)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = 5173
$url = "http://localhost:$port/"

function Show-Error([string]$message) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($message, "Passo", "OK", "Error")
}

# Passo responde con su título; otra aplicación en el mismo puerto no lo haría.
function Test-Passo {
    try {
        $page = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2
        return ($page.Content -match "Passo")
    } catch { return $false }
}

function Test-PortFree([int]$number) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $number)
    try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}

try {
    if (-not (Test-Path (Join-Path $root "node_modules"))) {
        throw "Faltan las dependencias de Passo.`n`nEjecuta en la carpeta del proyecto: npm install"
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "No se encontró Node.js (npm). Instálalo desde https://nodejs.org e inténtalo de nuevo."
    }

    if (-not (Test-Passo)) {
        if (-not (Test-PortFree $port)) {
            throw "El puerto $port lo usa otra aplicación; ciérrala e inténtalo de nuevo."
        }
        $server = Start-Process cmd -ArgumentList "/c", "npm run dev -- --port $port --strictPort" `
            -WorkingDirectory $root -WindowStyle Minimized -PassThru
        $deadline = (Get-Date).AddSeconds(60)
        while (-not (Test-Passo)) {
            if ($server.HasExited) {
                throw "El servidor se cerró al arrancar. Ejecuta 'npm run dev' en la carpeta del proyecto para ver el motivo."
            }
            if ((Get-Date) -gt $deadline) { throw "El servidor no respondió en 60 segundos." }
            Start-Sleep -Milliseconds 400
        }
    }

    if (-not $SinNavegador) { Start-Process $url }
} catch {
    Show-Error $_.Exception.Message
    exit 1
}
