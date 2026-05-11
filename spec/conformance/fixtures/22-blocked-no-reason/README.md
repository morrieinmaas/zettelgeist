# 22-blocked-no-reason — `blocked` without `blocked_by` renders an em-dash

The format does not require `blocked_by` to be set when `status: blocked`.
The INDEX renders `—` in the column. This is a soft convention rather than
a hard error; tooling may surface a hint elsewhere but it is not a
validation error per spec §11.
