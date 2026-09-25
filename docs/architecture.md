# Architecture

## MVP flow

```text
Dispute Input
    |
    v
Evidence Loader
    |
    +------------------+
    |                  |
    v                  v
Rider Advocate     Driver Advocate
    |                  |
    +--------+---------+
             |
             v
         Judge Agent
             |
             v
 Structured Resolution
             |
             +--> Agent communication log
             +--> Evidence references
             +--> Policy references
```

## Design principle

Keep evidence gathering and policy lookup deterministic where possible.
Use the LLM for interpretation, argument construction and explanation rather
than allowing it to invent trip facts.
