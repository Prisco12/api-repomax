# VPS capacity and storage operations

The local performance suite prepares the architecture for a VPS, but local
Docker Desktop results are estimates. Repeat `npm run perf:all` on the chosen
Linux VPS before production.

## Disk thresholds

- Below 70%: healthy.
- From 70%: warning; investigate database, logs, images and volumes.
- From 85%: critical; stop nonessential growth and expand or clean storage.

The HTML performance report applies these thresholds to the local host disk.
On the VPS, also monitor `df -h`, `docker system df` and PostgreSQL database
size. Never run automatic Docker cleanup without confirming what is unused.

## Logs

Compose uses Docker `json-file` rotation with five files of 20 MB per service.
This caps retained local logs at approximately 100 MB per container. External
centralized logs can have a separate retention policy.

## PostgreSQL backups

Production backups must leave the VPS. A suitable policy is:

1. Create a daily compressed custom-format `pg_dump`.
2. Encrypt and upload it to a private backup bucket or another provider.
3. Keep daily backups for 30 days and monthly backups for 12 months.
4. Enable bucket versioning and lifecycle rules.
5. Test restoration into a disposable database at least monthly.

Locally, run `npm run perf:backup-check` after a performance scenario. It makes
a temporary `pg_dump` while probing API readiness and deletes the dump when the
check finishes. A successful check does not replace the monthly restore test.

The destination, IAM role and retention cannot be activated before the hosting
and external backup destination are selected. Do not store the only backup in
the PostgreSQL Docker volume or on the same VPS disk.

## Docker image retention

Keep the active release and at least one known-good previous release for
rollback. After a successful deploy, inspect `docker system df` and remove only
images confirmed as unused and older than the chosen retention period. Build
cache and images from unrelated projects must not be removed by the application
deployment script.

## Memory and recovery checks

The individual performance report records peak memory, memory growth, peak CPU,
CPU at the end of cooldown, PostgreSQL connections and API health after load.
On Linux, additionally check `free -h` and `swapon --show`; sustained swap use
means the VPS does not have enough memory or container limits need adjustment.
