import dedent from 'dedent';

/**
 * This module exports various prompts used for model graded evaluation.
 * They are imported and re-exported by the `prompts` module.
 *
 * @module prompts
 */
export * from './external/ragas';
export const DEFAULT_GRADING_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: dedent`You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}

    Examples:

    <Output>Hello world</Output>
    <Rubric>Content contains a greeting</Rubric>
    {"reason": "the content contains the word 'Hello'", "pass": true, "score": 1.0}

    <Output>Avast ye swabs, repel the invaders!</Output>
    <Rubric>Does not speak like a pirate</Rubric>
    {"reason": "'avast ye' is a common pirate term", "pass": false, "score": 0.0}`,
  },
  {
    role: 'user',
    content: '<Output>\n{{ output }}\n</Output>\n<Rubric>\n{{ rubric }}\n</Rubric>',
  },
]);

// Based on https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml
// but modified for models capable of JSON output
export const PROMPTFOO_FACTUALITY_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: dedent`
      You are a precise factuality evaluator that compares a submitted answer to an expert answer. 

      Your task is to analyze the factual content while ignoring differences in style, grammar, or punctuation.
      You must categorize the submission into one of these options:

      (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
      (B) The submitted answer is a superset of the expert answer and is fully consistent with it.
      (C) The submitted answer contains all the same details as the expert answer.
      (D) There is a disagreement between the submitted answer and the expert answer.
      (E) The answers differ, but these differences don't matter from the perspective of factuality.

      Respond ONLY with a JSON object in this format:
      {
        "category": "[LETTER]",
        "reason": "[DETAILED EXPLANATION]"
      }

      - The "category" must be a single letter A, B, C, D, or E.
      - Provide a clear, detailed explanation in the "reason" field.
      - Your response must be valid JSON with no additional text.`,
  },
  {
    role: 'user',
    content: dedent`
      I need you to compare these answers:

      <question>
      {{input}}
      </question>

      <expert_answer>
      {{ideal}}
      </expert_answer>

      <submitted_answer>
      {{completion}}
      </submitted_answer>

      Please analyze the factual relationship between these answers according to the categories you've been given.`,
  },
]);

export const OPENAI_CLOSED_QA_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are assessing a submitted answer on a given task based on a criterion. Here is the data:
[BEGIN DATA]
***
[Task]: {{input}}
***
[Submission]: {{completion}}
***
[Criterion]: {{criteria}}
***
[END DATA]
Does the submission meet the criterion? First, write out in a step by step manner your reasoning about the criterion to be sure that your conclusion is correct. Avoid simply stating the correct answers at the outset. Then print only the single character "Y" or "N" (without quotes or punctuation) on its own line corresponding to the correct answer. At the end, repeat just the letter again by itself on a new line.

    Reasoning:`,
  },
]);

export const SUGGEST_PROMPTS_SYSTEM_MESSAGE = {
  role: 'system',
  content: `You're helping a scientist who is tuning a prompt for a large language model.  You will receive messages, and each message is a full prompt.  Generate a candidate variation of the given prompt.  This variation will be tested for quality in order to select a winner.

Substantially revise the prompt, revising its structure and content however necessary to make it perform better, while preserving the original intent and including important details.

Your output is going to be copied directly into the program. It should contain the prompt ONLY`,
};

export const SELECT_BEST_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are comparing multiple pieces of text to see which best fits the following criteria: {{criteria}}

Here are the pieces of text:

{% for output in outputs %}
<Text index="{{ loop.index0 }}">
{{ output }}
</Text>
{% endfor %}

Output the index of the text that best fits the criteria. You must output a single integer.`,
  },
]);
