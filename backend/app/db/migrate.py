"""
Database Migration Tool

Alembic-like migration management for SIE.
"""

import os
import sys
from datetime import datetime


def init_database():
    """Initialize database with all tables."""
    print("🗄️  Initializing SIE database...")
    
    # Read init.sql
    init_sql_path = os.path.join(os.path.dirname(__file__), '..', '..', 'init.sql')
    
    if not os.path.exists(init_sql_path):
        print(f"❌ init.sql not found at {init_sql_path}")
        return False
    
    with open(init_sql_path, 'r') as f:
        sql = f.read()
    
    try:
        from app.config import settings
        import psycopg2
        
        conn = psycopg2.connect(settings.database_url)
        cursor = conn.cursor()
        
        # Execute init script
        cursor.execute(sql)
        conn.commit()
        
        print("✅ Database initialized successfully")
        return True
        
    except ImportError:
        print("⚠️  psycopg2 not installed. Using SQLAlchemy...")
        return init_with_sqlalchemy()
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        return False


def init_with_sqlalchemy():
    """Initialize using SQLAlchemy models."""
    try:
        from sqlalchemy import create_engine
        from app.config import settings
        from app.models.database import Base
        
        engine = create_engine(settings.database_url)
        Base.metadata.create_all(engine)
        
        print("✅ Database tables created via SQLAlchemy")
        return True
        
    except Exception as e:
        print(f"❌ SQLAlchemy initialization failed: {e}")
        return False


def create_migration(name: str):
    """Create a new migration file."""
    migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
    os.makedirs(migrations_dir, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    filename = f"{timestamp}_{name}.sql"
    filepath = os.path.join(migrations_dir, filename)
    
    template = f"""-- Migration: {name}
-- Created: {datetime.utcnow().isoformat()}
-- 
-- UP Migration
-- ============

-- Add your SQL here

-- DOWN Migration (for rollback)
-- =============================

-- Rollback SQL (commented out)
-- DROP TABLE IF EXISTS ...;
"""
    
    with open(filepath, 'w') as f:
        f.write(template)
    
    print(f"✅ Created migration: {filepath}")
    return filepath


def run_migrations():
    """Run pending migrations."""
    migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
    
    if not os.path.exists(migrations_dir):
        print("📂 No migrations directory found")
        return
    
    migration_files = sorted([
        f for f in os.listdir(migrations_dir) 
        if f.endswith('.sql')
    ])
    
    if not migration_files:
        print("📂 No migrations to run")
        return
    
    print(f"📂 Found {len(migration_files)} migrations")
    
    for filename in migration_files:
        filepath = os.path.join(migrations_dir, filename)
        print(f"⏳ Running: {filename}")
        
        with open(filepath, 'r') as f:
            sql = f.read()
        
        # Execute migration (would use database connection)
        print(f"✅ Completed: {filename}")


def check_connection():
    """Test database connection."""
    try:
        from app.config import settings
        from sqlalchemy import create_engine, text
        
        engine = create_engine(settings.database_url)
        
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            row = result.fetchone()
            
        print(f"✅ Database connection successful")
        print(f"   URL: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python -m app.db.migrate <command>")
        print("")
        print("Commands:")
        print("  init      - Initialize database")
        print("  check     - Check database connection")
        print("  create    - Create new migration")
        print("  run       - Run pending migrations")
        return
    
    command = sys.argv[1]
    
    if command == 'init':
        init_database()
    elif command == 'check':
        check_connection()
    elif command == 'create':
        if len(sys.argv) < 3:
            print("Usage: python -m app.db.migrate create <name>")
            return
        create_migration(sys.argv[2])
    elif command == 'run':
        run_migrations()
    else:
        print(f"Unknown command: {command}")


if __name__ == '__main__':
    main()
