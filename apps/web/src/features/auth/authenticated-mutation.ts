import type { MutationFunctionContext, UseMutationOptions } from '@tanstack/react-query'

export interface AuthenticationGeneration {
    assertCurrent(): void
    isCurrent(): boolean
}

/** Fence feature callbacks too: clearing MutationCache alone cannot stop an already running mutation. */
export function authenticatedMutationOptions<TData, TError, TVariables, TContext>(
    options: UseMutationOptions<TData, TError, TVariables, TContext>,
    generation: AuthenticationGeneration,
    executions: WeakMap<MutationFunctionContext, AuthenticationGeneration>,
): UseMutationOptions<TData, TError, TVariables, TContext> {
    return {
        ...options,
        retry: false,
        onMutate: async (variables, context) => {
            generation.assertCurrent()
            executions.set(context, generation)
            return options.onMutate?.(variables, context) as TContext | Promise<TContext>
        },
        mutationFn: options.mutationFn
            ? async (variables, context) => {
                  const execution = executions.get(context) ?? generation
                  execution.assertCurrent()
                  const result = await options.mutationFn!(variables, context)
                  execution.assertCurrent()
                  return result
              }
            : undefined,
        onSuccess: (data, variables, result, context) => {
            if (executions.get(context)?.isCurrent()) return options.onSuccess?.(data, variables, result, context)
        },
        onError: (error, variables, result, context) => {
            if (executions.get(context)?.isCurrent()) return options.onError?.(error, variables, result, context)
        },
        onSettled: (data, error, variables, result, context) => {
            if (executions.get(context)?.isCurrent())
                return options.onSettled?.(data, error, variables, result, context)
        },
    }
}
