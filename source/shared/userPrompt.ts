import readline from 'readline/promises'

export async function promptUserChoice(question: string, acceptableValues: string[], abortOnInvalid: boolean = true): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	while (true) {
		const answer = (await rl.question(question)).trim();
		if (acceptableValues.includes(answer)) {
			rl.close();
			return answer;
		} else {
			console.log(`Invalid input. Acceptable values are: ${acceptableValues.join(', ')}`);
			if (abortOnInvalid) {
				rl.close();
				console.log('Aborting.');
				process.exit(1);
			}
			// Otherwise, re-prompt
		}
	}
}


