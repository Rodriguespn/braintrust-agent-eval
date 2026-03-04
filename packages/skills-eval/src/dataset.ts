import type {SkillEvalCase} from './scorer.js'



export const dataset: SkillEvalCase[] = [
    {
    input: {
        prompt: 'You are a Postgres expert. Edit the tables inside squema.sql to create RLS policies that allow users to only see their own orders'
    },
    expected: {
        referenceFilesRead: ['schema.sql'],
        requiredTools: ['file_read', 'file_edit'],
    },
    metadata: {
        category: ['database'],
        description: 'Test the agent\'s ability to read a schema file and generate a SQL query based on the prompt.'
    }
},
]