#!/bin/sh
set -eu

APP="${APP:-}"
if [ -z "${APP}" ]; then
    echo "error: APP environment variable is not set." >&2
    echo "expected one of: web, core-backend, matching-engine, risk-engine, db-worker, oracle-service" >&2
    exit 1
fi

db_migrations_applied() {
    ( cd /app/packages/database && bun -e '
        import pg from "pg";
        const { Client } = pg;
        const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
        (async () => {
            try {
                await client.connect();
                const res = await client.query("SELECT to_regclass($$public._prisma_migrations$$) AS tbl");
                if (!res.rows[0].tbl) {
                    console.log("no");
                } else {
                    const cnt = await client.query("SELECT count(*)::int AS n FROM _prisma_migrations");
                    console.log(cnt.rows[0].n > 0 ? "yes" : "no");
                }
                await client.end();
            } catch (err) {
                console.error("migrations: probe error: " + (err && err.message ? err.message : String(err)));
                try { await client.end(); } catch {}
                process.exit(2);
            }
        })();
    ' )
}

ensure_migrations() {
    if [ "${APP}" = "core-backend" ]; then
        enabled="${MIGRATE_ON_START:-true}"
    else
        enabled="${MIGRATE_ON_START:-false}"
    fi
    [ "${enabled}" = "true" ] || return 0
    [ -n "${DATABASE_URL:-}" ] || return 0
    [ -d /app/packages/database ] || return 0

    echo "migrations: checking database for applied migrations..."
    db_host="$(printf '%s' "${DATABASE_URL}" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^@]*@##')"
    echo "migrations: connecting to ${db_host}"
    result=""
    tries=0
    while :; do
        if result="$(db_migrations_applied)"; then
            break
        fi
        tries=$((tries + 1))
        if [ "${tries}" -ge 30 ]; then
            echo "migrations: database unreachable after ${tries} attempts — continuing without migrating" >&2
            return 0
        fi
        sleep 2
    done

    if [ "${result}" = "yes" ]; then
        echo "migrations: already applied (_prisma_migrations found) — skipping"
        return 0
    fi

    echo "migrations: database has no migrations — running prisma migrate deploy + generate"
    cd /app/packages/database || return 1
    bun run db:deploy
    status=$?
    if [ "${status}" -eq 0 ]; then
        bun run db:generate
        status=$?
    fi
    cd /app
    return "${status}"
}

case "${APP}" in
    web)
        cd /app/apps/web
        exec bun run start
        ;;
    core-backend)
        ensure_migrations
        cd /app/apps/core-backend
        exec bun src/index.ts
        ;;
    matching-engine)
        ensure_migrations
        cd /app/apps/matching-engine
        exec bun index.ts
        ;;
    risk-engine)
        ensure_migrations
        cd /app/apps/risk-engine
        exec bun main.ts
        ;;
    db-worker)
        ensure_migrations
        cd /app/apps/db-worker
        exec bun index.ts
        ;;
    oracle-service)
        cd /app/apps/oracle-service
        exec bun index.ts
        ;;
    *)
        echo "error: unknown APP='${APP}' (expected web | core-backend | matching-engine | risk-engine | db-worker | oracle-service)" >&2
        exit 1
        ;;
esac
