// ---------------------------------------------------------------------------
// Seed exam — 10 IGCSE / GCSE-level questions across algebra, geometry,
// fractions, percentages and simple equations. A mix of MCQ and free-text.
//
// Each question carries:
//   id, type ('mcq' | 'text'), topic, prompt (plain text, also sent to the AI),
//   latex (clean KaTeX form for display), options[] (mcq only),
//   correctAnswer, acceptedAnswers[] (text only — equivalent forms),
//   workingNotes (step-by-step solution, hidden until review).
// ---------------------------------------------------------------------------

export const EXAM_QUESTIONS = [
  {
    id: 'q1',
    type: 'mcq',
    topic: 'Algebra',
    prompt: 'Solve for x:  3x + 7 = 22',
    latex: '3x + 7 = 22',
    options: ['x = 3', 'x = 5', 'x = 7', 'x = 9'],
    correctAnswer: 'x = 5',
    acceptedAnswers: [],
    workingNotes:
      'Subtract 7 from both sides: 3x = 15. Divide both sides by 3: x = 5.',
  },
  {
    id: 'q2',
    type: 'text',
    topic: 'Equations',
    prompt: 'Solve for x:  5(x − 2) = 20',
    latex: '5(x - 2) = 20',
    correctAnswer: 'x = 6',
    acceptedAnswers: ['x = 6', '6', 'x=6'],
    workingNotes:
      'Expand: 5x − 10 = 20. Add 10 to both sides: 5x = 30. Divide by 5: x = 6.',
  },
  {
    id: 'q3',
    type: 'text',
    topic: 'Fractions',
    prompt: 'Work out  3/4 + 1/8 .  Give your answer as a fraction in its simplest form.',
    latex: '\\frac{3}{4} + \\frac{1}{8}',
    correctAnswer: '7/8',
    acceptedAnswers: ['7/8', '0.875', '.875'],
    workingNotes:
      'Common denominator 8: 3/4 = 6/8. Then 6/8 + 1/8 = 7/8, which is already in simplest form.',
  },
  {
    id: 'q4',
    type: 'mcq',
    topic: 'Percentages',
    prompt: 'Find 15% of 240.',
    latex: '15\\% \\text{ of } 240',
    options: ['30', '36', '40', '45'],
    correctAnswer: '36',
    acceptedAnswers: [],
    workingNotes: '10% of 240 = 24, and 5% = 12. So 15% = 24 + 12 = 36.',
  },
  {
    id: 'q5',
    type: 'text',
    topic: 'Geometry',
    prompt:
      'A triangle has base 8 cm and perpendicular height 5 cm. Find its area. Include units.',
    latex: '\\text{base } = 8\\,\\text{cm}, \\quad \\text{height } = 5\\,\\text{cm}',
    correctAnswer: '20 cm²',
    acceptedAnswers: ['20 cm²', '20cm²', '20 cm^2', '20cm2', '20cm^2', '20'],
    workingNotes:
      'Area of a triangle = ½ × base × height = ½ × 8 × 5 = 20 cm². Units are square centimetres because it is an area.',
  },
  {
    id: 'q6',
    type: 'mcq',
    topic: 'Equations',
    prompt: 'Solve for x:  2x − 3 = 9',
    latex: '2x - 3 = 9',
    options: ['x = 3', 'x = 4', 'x = 6', 'x = 12'],
    correctAnswer: 'x = 6',
    acceptedAnswers: [],
    workingNotes: 'Add 3 to both sides: 2x = 12. Divide by 2: x = 6.',
  },
  {
    id: 'q7',
    type: 'text',
    topic: 'Algebra',
    prompt: 'Factorise fully:  x² − 9',
    latex: 'x^2 - 9',
    correctAnswer: '(x − 3)(x + 3)',
    acceptedAnswers: [
      '(x-3)(x+3)',
      '(x+3)(x-3)',
      '(x - 3)(x + 3)',
      '(x+3)(x−3)',
    ],
    workingNotes:
      'This is a difference of two squares: a² − b² = (a − b)(a + b), with a = x and b = 3. So x² − 9 = (x − 3)(x + 3).',
  },
  {
    id: 'q8',
    type: 'text',
    topic: 'Fractions',
    prompt: 'Write the decimal 0.6 as a fraction in its simplest form.',
    latex: '0.6 = \\;?',
    correctAnswer: '3/5',
    acceptedAnswers: ['3/5', '0.6', '6/10'],
    workingNotes:
      '0.6 = 6/10. Divide top and bottom by the common factor 2: 6/10 = 3/5.',
  },
  {
    id: 'q9',
    type: 'mcq',
    topic: 'Geometry',
    prompt:
      'A circle has radius 7 cm. Using π ≈ 22/7, find its circumference.',
    latex: 'r = 7\\,\\text{cm}, \\quad C = 2\\pi r',
    options: ['22 cm', '44 cm', '88 cm', '154 cm'],
    correctAnswer: '44 cm',
    acceptedAnswers: [],
    workingNotes:
      'Circumference C = 2πr = 2 × (22/7) × 7 = 44 cm. (154 cm² would be the area — a common trap.)',
  },
  {
    id: 'q10',
    type: 'text',
    topic: 'Percentages',
    prompt: 'A jacket costs £80. Its price is increased by 25%. What is the new price?',
    latex: '£80 \\;\\xrightarrow{\\;+25\\%\\;}\\; ?',
    correctAnswer: '£100',
    acceptedAnswers: ['£100', '100', '100 pounds', '£100.00', '100.00'],
    workingNotes:
      '25% of £80 = £20. New price = £80 + £20 = £100. (Equivalently, 80 × 1.25 = 100.)',
  },
]

export const EXAM_META = {
  title: 'IGCSE Mathematics Mock',
  subtitle: 'Mixed topics · No calculator',
  durationSeconds: 20 * 60, // 20:00
}
