import readline from "readline/promises"

/**
 * Prompts the user for a yes/no answer. Accepts 'y', 'yes', 'n', 'no' (case-insensitive).
 * Returns true for yes, false for no.
 */
export async function promptYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	const prompt = question.trim().replace(/[\s:]+$/, "") + " (y/n): "
	while (true) {
		const answer = (await rl.question(prompt)).trim().toLowerCase()
		if (answer === "y" || answer === "yes") {
			rl.close()
			return true
		}
		if (answer === "n" || answer === "no") {
			rl.close()
			return false
		}
		console.log("Please answer 'y' or 'n'.")
	}
}

/**
 * Prompts the user for a value. If acceptableValues is non-empty, only accepts those values.
 * If acceptableValues is empty and abortOnInvalid is false, returns any user input (free-form).
 * If abortOnInvalid is true, aborts on invalid input. Otherwise, re-prompts.
 */
export async function promptUserChoice(
	question: string,
	acceptableValues: string[],
	abortOnInvalid: boolean = true,
): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	while (true) {
		const answer = (await rl.question(question)).trim()
		if (acceptableValues.length === 0 && abortOnInvalid === false) {
			rl.close()
			return answer
		}
		if (acceptableValues.includes(answer)) {
			rl.close()
			return answer
		} else {
			console.log(`Invalid input. Acceptable values are: ${acceptableValues.join(", ")}`)
			if (abortOnInvalid) {
				rl.close()
				console.log("Aborting.")
				process.exit(1)
			}
			// Otherwise, re-prompt
		}
	}
}
