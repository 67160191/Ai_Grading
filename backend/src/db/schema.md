erDiagram
users {
INTEGER id PK
TEXT name
TEXT email
TEXT password
TEXT role
TEXT created_at
}

    courses {
        INTEGER id PK
        TEXT name
        TEXT description
        INTEGER teacher_id FK
        TEXT created_at
    }

    enrollments {
        INTEGER id PK
        INTEGER student_id FK
        INTEGER course_id FK
        TEXT enrolled_at
    }

    rubric_templates {
        INTEGER id PK
        INTEGER course_id FK
        TEXT name
        TEXT description
        TEXT created_at
    }

    rubric_criteria {
        INTEGER id PK
        INTEGER rubric_id FK
        TEXT name
        TEXT description
        INTEGER order_index
    }

    rubric_levels {
        INTEGER id PK
        INTEGER rubric_criteria_id FK
        TEXT level
        TEXT description
    }

    assignments {
        INTEGER id PK
        INTEGER course_id FK
        INTEGER rubric_id FK
        TEXT title
        TEXT description
        TEXT deadline
        REAL auto_approve_threshold
        INTEGER allow_paste
        TEXT created_at
    }

    submissions {
        INTEGER id PK
        INTEGER assignment_id FK
        INTEGER student_id FK
        TEXT file_path
        TEXT content_text
        INTEGER attempt
        TEXT status
        TEXT submitted_at
    }

    grading_jobs {
        INTEGER id PK
        INTEGER submission_id FK
        TEXT status
        TEXT error
        TEXT created_at
        TEXT updated_at
    }

    assignment_rubric_overrides {
        INTEGER id PK
        INTEGER assignment_id FK
        TEXT created_at
    }

    assignment_override_criteria {
        INTEGER id PK
        INTEGER override_id FK
        TEXT name
        TEXT description
        INTEGER order_index
    }

    assignment_override_levels {
        INTEGER id PK
        INTEGER override_criteria_id FK
        TEXT level
        TEXT description
    }

    grades {
        INTEGER id PK
        INTEGER submission_id FK
        INTEGER rubric_criteria_id FK
        INTEGER override_criteria_id FK
        TEXT criteria_name
        INTEGER level
        TEXT reasoning
        TEXT feedback
        TEXT created_at
    }

    grade_approvals {
        INTEGER id PK
        INTEGER submission_id FK
        INTEGER teacher_id FK
        TEXT action
        TEXT note
        REAL final_level
        TEXT approved_at
    }

    appeals {
        INTEGER id PK
        INTEGER submission_id FK
        INTEGER student_id FK
        TEXT reason
        TEXT status
        TEXT teacher_response
        TEXT created_at
        TEXT updated_at
    }

    users ||--o{ courses : "teaches"
    users ||--o{ enrollments : "student"
    users ||--o{ submissions : "submits"
    users ||--o{ grade_approvals : "approves"
    users ||--o{ appeals : "files"

    courses ||--o{ enrollments : "has"
    courses ||--o{ rubric_templates : "owns"
    courses ||--o{ assignments : "contains"

    rubric_templates ||--o{ rubric_criteria : "defines"
    rubric_templates ||--o{ assignments : "used by"

    rubric_criteria ||--o{ rubric_levels : "has levels"
    rubric_criteria ||--o{ grades : "scored by"

    assignments ||--o{ submissions : "receives"
    assignments ||--o| assignment_rubric_overrides : "overridden by"

    assignment_rubric_overrides ||--o{ assignment_override_criteria : "defines"
    assignment_override_criteria ||--o{ assignment_override_levels : "has levels"
    assignment_override_criteria ||--o{ grades : "scored by"

    submissions ||--o{ grading_jobs : "queued"
    submissions ||--o{ grades : "receives"
    submissions ||--o{ grade_approvals : "reviewed"
    submissions ||--o{ appeals : "appealed"
