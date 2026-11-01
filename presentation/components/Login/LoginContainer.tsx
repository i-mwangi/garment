"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/presentation/contexts/DemoProvider";
import { workspaceFetch } from "@/presentation/services/api/seeded-workspace";
import AuthCard from "@/components/Login/AuthCard";
import AuthCanvas from "./AuthCanvas";
import { useNearWallet } from "@/contexts/NearWalletProvider";
export default function LoginContainer() {
    const router = useRouter();
    const wallet = useNearWallet();
    const { isLoggedIn, isOnboarded, login, isLoaded } = useDemo();
    useEffect(() => {
        if (!isLoaded)
            return;
        if (isLoggedIn && isOnboarded) {
            router.replace("/");
        }
        else if (isLoggedIn && !isOnboarded) {
            router.replace("/onboarding");
        }
    }, [isLoggedIn, isOnboarded, isLoaded, router]);
    const handleCredentials = async (email: string, password: string) => {
        await workspaceFetch("/api/auth/password", "POST", { email, password });
        window.location.assign("/");
    };
    const handleWeb3Auth = async () => {
        const address = await wallet.connect();
        const challenge = await workspaceFetch<{id:string;message:string}>("/api/team/auth", "POST", { action: "challenge", address });
        const signature = await wallet.signMessage(challenge.message);
        await workspaceFetch("/api/team/auth", "POST", { action: "verify", id: challenge.id, signature });
        window.location.assign("/");
    };
    return (<AuthCanvas>
      <AuthCard onCredentials={handleCredentials} onWeb3Auth={handleWeb3Auth}/>
    </AuthCanvas>);
}
