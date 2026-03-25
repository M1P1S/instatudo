"""
Cria um usuário de teste com plano PRO no banco de dados.
Execute: python create_test_user.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from backend.db.database import init_db, get_connection
from backend.modules.app_auth import hash_password

EMAIL = "teste@instatudo.com"
PASSWORD = "teste123"
NAME = "Usuário Teste PRO"

def create_test_user():
    init_db()
    conn = get_connection()

    existing = conn.execute("SELECT id FROM users WHERE email = ?", (EMAIL,)).fetchone()
    if existing:
        conn.execute("UPDATE users SET plan = 'pro' WHERE email = ?", (EMAIL,))
        conn.commit()
        print(f"Usuário já existe — plano atualizado para PRO.")
    else:
        from datetime import datetime
        conn.execute(
            "INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (?, ?, ?, 'pro', ?)",
            (EMAIL, hash_password(PASSWORD), NAME, datetime.utcnow().isoformat())
        )
        conn.commit()
        print("Usuário de teste criado com sucesso!")

    conn.close()
    print(f"\n  E-mail : {EMAIL}")
    print(f"  Senha  : {PASSWORD}")
    print(f"  Plano  : PRO\n")

if __name__ == "__main__":
    create_test_user()
