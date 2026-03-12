@echo off
chcp 65001 > nul
echo.
echo ╔══════════════════════════════════════╗
echo ║          InstaTudo                   ║
echo ╚══════════════════════════════════════╝
echo.

:: Verifica Python
python --version > nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado.
    echo Baixe em: https://www.python.org/downloads/
    echo Marque a opcao "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

:: Cria ambiente virtual se nao existir
if not exist ".venv" (
    echo Criando ambiente virtual...
    python -m venv .venv
)

:: Ativa o ambiente virtual
call .venv\Scripts\activate.bat

:: Instala dependencias
echo Instalando dependencias...
pip install -q -r requirements.txt

:: Inicia o servidor
echo.
echo Servidor iniciado em http://localhost:8000
echo Pressione Ctrl+C para parar
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
