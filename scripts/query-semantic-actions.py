import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


def main() -> None:
    load_dotenv(Path("backend") / ".env")
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        raise SystemExit("DATABASE_URL missing in backend/.env")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, intent, scope, state, outcome, version, created_at, steps_json
                FROM procedures
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
            print("PROCEDURES")
            for row in cur.fetchall():
                try:
                    steps = json.loads(row[7] or "[]")
                except Exception as exc:
                    steps = f"unparseable: {exc}"
                print(
                    json.dumps(
                        {
                            "id": row[0],
                            "intent": row[1],
                            "scope": row[2],
                            "state": row[3],
                            "outcome": row[4],
                            "version": row[5],
                            "createdAt": str(row[6]),
                            "stepCount": len(steps) if isinstance(steps, list) else None,
                            "steps": steps,
                        },
                        ensure_ascii=False,
                    )
                )

            cur.execute(
                """
                SELECT id, intent, app_package, status, created_at, actions_json
                FROM learning_sessions
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
            print("LEARNING_SESSIONS")
            for row in cur.fetchall():
                actions = json.loads(row[5] or "[]")
                print(
                    json.dumps(
                        {
                            "id": row[0],
                            "intent": row[1],
                            "appPackage": row[2],
                            "status": row[3],
                            "createdAt": str(row[4]),
                            "actionCount": len(actions),
                            "actions": actions,
                        },
                        ensure_ascii=False,
                    )
                )


if __name__ == "__main__":
    main()
