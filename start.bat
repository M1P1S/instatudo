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

:: Remove venv corrompido e recria
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
    python -c "import uvicorn" > nul 2>&1
    if errorlevel 1 (
        echo Ambiente incompleto, recriando...
        rmdir /s /q .venv
    )
)

if not exist ".venv" (
    echo Criando ambiente virtual...
    python -m venv .venv
)

:: Ativa o ambiente virtual
call .venv\Scripts\activate.bat

:: Atualiza pip e instala dependencias
echo Atualizando pip...
python -m pip install --upgrade pip --quiet
echo Instalando dependencias...
pip install -r requirements.txt --quiet --prefer-binary

:: Inicia o servidor
echo.
echo Servidor iniciado em http://localhost:8000
echo Pressione Ctrl+C para parar
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
