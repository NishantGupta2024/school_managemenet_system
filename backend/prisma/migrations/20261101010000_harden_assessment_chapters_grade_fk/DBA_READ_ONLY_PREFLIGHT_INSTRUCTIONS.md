# DBA Read-Only Preflight: Instructions (revision 4)

Script: `DBA_READ_ONLY_PREFLIGHT.sql` (same folder)
Migration under review: `20261101010000_harden_assessment_chapters_grade_fk`

> **This does NOT authorize running the migration.** The script only reads. The migration needs separate, explicit approval.
> **Nothing in this procedure has been runtime-tested.** The script, the psql conditionals, both authentication methods and the output capture below have been statically reviewed only.

## Target (must match exactly)
- Host: **localhost**, port: **5432**, database: **fee_iso_test**, role: **fee_iso_readonly**.
- Never run this against `fee_dev`, `fee_db`, production or anything else.

## Rules
1. Use a credential you are authorized to use. The DBA supplies the password. Nobody generates or invents one for this procedure.
2. Never place the password in shell history, command-line arguments, source files, scripts, `.env`, report output or Git.
3. **The script enforces the endpoint check itself.** Section A requires all of: database exactly `fee_iso_test`, server address in a loopback range (`127.0.0.0/8` or `::1`), and server port exactly `5432`. If any is wrong or unavailable, the script prints `BLOCKED - DATABASE IDENTITY NOT VERIFIED` with the connected database, address and port, runs no further inspection, raises a deliberate error (`division by zero`, psql exit status 3) and quits. That error text is expected in this case.
4. **Known limitation of the endpoint check:** the address and port are those the *server* reports. If the database runs in a container, behind a port forward, or on another machine, the check can block even though you connected to `localhost`. Do not bypass it. Report the printed address and port to the project owner.

## Requirements
- **psql 10 or later** on the DBA's machine. The script uses `\if`, `\else` and `\endif`, which older psql versions do not support. Check with `psql --version`.
- **PostgreSQL server 12 or later.** The index checks use `indnkeyatts`, `WITH ORDINALITY` and `FILTER`.

## Authentication (both methods are runtime-unverified)
### Preferred: interactive prompt
Run the command in the next section and type the password when psql asks. **Whether the prompt works while stdout and stderr are redirected has not been runtime-tested.** If no prompt appears or the run hangs, stop it (Ctrl+C) and use the fallback below.

### Fallback: a unique temporary password file
Never create, edit or overwrite `%APPDATA%\postgresql\pgpass.conf`. Use a separate file selected with `PGPASSFILE`, in **one `cmd.exe` window that you keep open until cleanup**.

1. Pick a unique file name and set `PGPASSFILE` for this window only (the path is not secret):
   ```bat
   set PGPASSFILE=%USERPROFILE%\pgpass_preflight_%RANDOM%%RANDOM%.tmp
   if exist "%PGPASSFILE%" (echo FILE EXISTS - close this window and start again) else (echo %PGPASSFILE% is free)
   ```
2. Create the file in a text editor, **not** with `echo`, so the password never enters command history. Use an editor without autosave, backup or recent-files features, such as Notepad:
   ```bat
   notepad "%PGPASSFILE%"
   ```
   The file must contain exactly one line (the host field must match `-h localhost`):
   `localhost:5432:fee_iso_test:fee_iso_readonly:<password supplied by the DBA>`
3. Restrict permissions **without removing SYSTEM or Administrators access.** First look at the current access list:
   ```bat
   icacls "%PGPASSFILE%"
   ```
   A new file in your profile normally inherits access for your account, SYSTEM and Administrators only. If broader groups appear (Users, Authenticated Users, Everyone), keep the inherited entries as explicit ones and then remove only those groups, and give your own account full control so you can delete the file:
   ```bat
   icacls "%PGPASSFILE%" /inheritance:d
   icacls "%PGPASSFILE%" /remove:g *S-1-1-0 *S-1-5-11 *S-1-5-32-545
   icacls "%PGPASSFILE%" /grant:r "%USERNAME%:(F)"
   icacls "%PGPASSFILE%"
   ```
   The final listing should show only your account, SYSTEM and Administrators. These `icacls` commands are untested here. Do not continue if the listing still shows broader groups.
4. If psql does not accept the file, it may fall back to prompting. If the run appears to hang, press Ctrl+C.
5. **Cleanup, immediately after the run (also after a failed run):**
   ```bat
   del "%PGPASSFILE%"
   if exist "%PGPASSFILE%" (echo STILL PRESENT - remove it manually) else (echo removed)
   set PGPASSFILE=
   ```
   Then close the window. A normal delete does not wipe the disk blocks. Because the password was written to disk, rotate the `fee_iso_readonly` password afterwards if your policy requires it.

Never use `PGPASSWORD`, a password in the connection string, or a password inside any script, note or report.

## Run and capture the complete report
Run in **`cmd.exe`** from the repository root (not PowerShell, whose redirection can re-encode the file and wrap error text). Output goes **outside the repository**, to your user profile:
```bat
psql --version
psql -h localhost -p 5432 -U fee_iso_readonly -d fee_iso_test -X -f backend\prisma\migrations\20261101010000_harden_assessment_chapters_grade_fk\DBA_READ_ONLY_PREFLIGHT.sql > "%USERPROFILE%\preflight_report.txt" 2>&1
echo psql exit status: %ERRORLEVEL% > "%USERPROFILE%\preflight_exit_status.txt"
type "%USERPROFILE%\preflight_exit_status.txt"
```
- The `echo` line must be the very next command after `psql`, so `%ERRORLEVEL%` is psql's exit status. Do not wrap psql in anything that hides or overrides its exit status.
- **Do not use `-o`.** The script's headings use `\qecho`, and the shell redirect captures every channel in one file, including errors (`2>&1`).
- The script sets `ON_ERROR_STOP`, so any failed statement stops the run. No other flag is needed.
- Do not write either file anywhere under `D:\fee`, so it cannot be committed.

## What to return to the project owner (checklist)
Send these through a secure channel:
- [ ] `%USERPROFILE%\preflight_report.txt`
- [ ] **The psql exit status**: the file `%USERPROFILE%\preflight_exit_status.txt` (or the number printed on screen)
- [ ] The output of `psql --version`
- [ ] Confirmation that the temporary password file, if used, was deleted

The report contains the server address and port, the role name, migration names and, only if orphans exist, school IDs. It contains no credentials, because the script never prints any. Review it before sending, and delete both files afterwards according to your policy.

## stdout and stderr ordering
- The command above captures both stdout and stderr in the same file.
- Redirected stdout can be buffered, so **error messages may appear before or after the report section that caused them.**
- **The error text and the exit status are authoritative.** Do not infer the order in which statements ran from where an error line sits in the file.

## Completeness marker and exit status
A complete inspection ends with:
`=== END OF REPORT (printed only after the script completed and the read-only transaction was rolled back) ===`

**If this line is missing, treat the report as incomplete.** It is also missing when a gate stopped the run, so check for a `BLOCKED` message and any error text.

| Outcome | Report contains | psql exit status |
|---|---|---|
| `READY FOR SEPARATE EXECUTION APPROVAL` | Verdict table, END OF REPORT, `RESULT: READY ...` | **0** |
| Any `BLOCKED` verdict from section F | Complete verdict table, END OF REPORT, `RESULT: BLOCKED ...` and then an intentional `division by zero` error | **non-zero (3)** |
| Identity gate or history gate stopped the run | `BLOCKED - DATABASE IDENTITY NOT VERIFIED` or `BLOCKED - MIGRATION HISTORY ISSUE`, an intentional error, **no** END OF REPORT | **non-zero (3)** |
| Other statement failed | psql error text, no verdict, no END OF REPORT | **non-zero** |

**A report with a complete BLOCKED verdict and the END OF REPORT marker is valid, and the non-zero exit status is correct, not a script failure.** The `division by zero` error after the marker is deliberate. READY is the only outcome that exits 0, and it is still not an authorization to run the migration.

## Gates and how failures are classified
| Situation | What the script prints | Classification |
|---|---|---|
| Database, loopback address or port is wrong or unavailable | `BLOCKED - DATABASE IDENTITY NOT VERIFIED` plus the connected database, address and port | Stop. No inspection ran. |
| `public._prisma_migrations` is missing | `BLOCKED - MIGRATION HISTORY ISSUE` | Migration history issue. Do not create the table. |
| `public._prisma_migrations` exists but the role has no `SELECT` | `BLOCKED - MIGRATION HISTORY ISSUE` | Migration history issue. Ask for a read grant. |
| Later statement fails (for example no `SELECT` on `assessment_chapters`, or a missing table) | psql error text, no verdict, no end marker | Report as `BLOCKED - OTHER SCHEMA DISCREPANCY`, with the error text. |
| Section F prints a verdict | The verdict table, verified database, server address and port, the end marker and the RESULT line | Use the verdict. |

## How indexes are assessed
- **E4** lists every index on `assessment_chapters` and `grade_classes` with `is_valid`, `is_ready`, `is_unique`, `no_partial_predicate`, `no_expression_columns`, key column count, ordered key columns, and any INCLUDE columns shown separately.
- **E5, a correctness requirement:** `grade_classes` must have a valid, ready, unique index with no partial predicate and no expression columns. It must have exactly 2 key columns, in the order `schoolId`, `id`. This follows `@@unique([schoolId, id])` in `schema.prisma`. INCLUDE columns do not count as key columns. If none qualifies, the verdict is `BLOCKED - OTHER SCHEMA DISCREPANCY`.
- **E6, a performance recommendation only:** an index on `assessment_chapters` leading with `schoolId`, `gradeId`. It never affects the verdict.
- Foreign-key inspection (section C) is separate from index inspection.

## Checksum comparison (done separately from the SQL)
The SQL shows the recorded checksum only if the migration is already applied (section B4). Compute the local file checksum yourself:
```powershell
(Get-FileHash backend\prisma\migrations\20261101010000_harden_assessment_chapters_grade_fk\migration.sql -Algorithm SHA256).Hash.ToLower()
```
Prisma stores a lowercase SHA-256 of the file. If B4 returns a row, the verdict is `BLOCKED - MIGRATION ALREADY APPLIED`, and the checksum comparison is for review only. Do not repair it.

## Expected state before the migration
- Section A: `fee_iso_test`, loopback address, port 5432, `transaction_read_only = on`, `IDENTITY GATE: PASSED`.
- Section B: `HISTORY GATE: PASSED`. B4 returns zero rows. B5 shows the prerequisite migration `20261031010000_add_chapter_ownership_and_academic_year` applied. B6 returns zero rows.
- Section C: exactly one constraint, a foreign key `public.assessment_chapters (schoolId, gradeId)` to `public.grade_classes (schoolId, id)`, `CASCADE` / `CASCADE`, not deferrable, not initially deferred, validated.
- Section D: `orphaned_chapters = 0`.
- Section E: both tables and four columns present. E5 returns one qualifying index.
- Section F: `READY FOR SEPARATE EXECUTION APPROVAL`, with `verified_database = fee_iso_test`, exit status 0.

Any other verdict is a stop. Do not repair anything automatically.
